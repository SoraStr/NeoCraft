//! CPU affinity — bind processes to specific CPU cores (macOS only).

/// Parse a CPU list string like "0,1,2-4" into a u64 bitmask.
///
/// # Examples
/// - "0" => 0b1
/// - "0,2,4" => 0b10101
/// - "0-3" => 0b1111
/// - "0-1,4,6-7" => bits 0,1,4,6,7 set
pub fn parse_cpu_list(cpu_list: &str) -> Result<u64, String> {
    let mut mask: u64 = 0;
    for part in cpu_list.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some(pos) = part.find('-') {
            let start: u32 = part[..pos]
                .trim()
                .parse()
                .map_err(|_| format!("invalid CPU: {}", part))?;
            let end: u32 = part[pos + 1..]
                .trim()
                .parse()
                .map_err(|_| format!("invalid CPU: {}", part))?;
            if start > 63 || end > 63 {
                return Err(format!("CPU index must be 0-63, got {}-{}", start, end));
            }
            if start > end {
                return Err(format!("invalid CPU range: {}-{}", start, end));
            }
            for cpu in start..=end {
                mask |= 1 << cpu;
            }
        } else {
            let cpu: u32 = part
                .parse()
                .map_err(|_| format!("invalid CPU: {}", part))?;
            if cpu > 63 {
                return Err(format!("CPU index must be 0-63, got {}", cpu));
            }
            mask |= 1 << cpu;
        }
    }
    Ok(mask)
}

/// Set CPU affinity for a spawned child process on macOS.
///
/// `cpu_list` is e.g. "0,1,2,3" or "0-3" or "0,2,4".
/// An empty string means "no affinity" (use all cores) — this is a no-op.
///
/// On non-macOS platforms, this is a no-op that always returns Ok.
#[cfg(target_os = "macos")]
pub fn set_process_affinity(pid: u32, cpu_list: &str) -> Result<(), String> {
    if cpu_list.trim().is_empty() {
        return Ok(());
    }

    let mask = parse_cpu_list(cpu_list)?;
    if mask == 0 {
        return Ok(());
    }

    unsafe {
        // Get the task port for the child process
        let mut task: mach2::port::mach_port_name_t = 0;
        let kr = mach2::traps::task_for_pid(
            mach2::traps::mach_task_self(),
            pid as libc::c_int,
            &mut task,
        );
        if kr != mach2::kern_return::KERN_SUCCESS {
            return Err(format!("task_for_pid failed with error {}", kr));
        }

        // Get list of threads in the task
        let mut thread_list: mach2::port::mach_port_array_t = std::ptr::null_mut();
        let mut thread_count: libc::mach_msg_type_number_t = 0;
        let kr = mach2::task::task_threads(task, &mut thread_list, &mut thread_count);
        if kr != mach2::kern_return::KERN_SUCCESS {
            return Err(format!("task_threads failed with error {}", kr));
        }

        // Set affinity for each thread
        let policy = ThreadAffinityPolicy {
            affinity_tag: mask as i32,
        };
        for i in 0..thread_count as isize {
            let thread = *thread_list.offset(i);
            let kr = mach2::thread_policy::thread_policy_set(
                thread,
                mach2::thread_policy::THREAD_AFFINITY_POLICY,
                &policy as *const _ as libc::thread_policy_t,
                mach2::thread_policy::THREAD_AFFINITY_POLICY_COUNT,
            );
            // Don't error on individual thread failures — some may have exited
            if kr != mach2::kern_return::KERN_SUCCESS {
                // silently continue
            }
        }

        // Free thread list
        let _ = mach2::vm::mach_vm_deallocate(
            mach2::traps::mach_task_self(),
            thread_list as u64,
            (thread_count as usize * std::mem::size_of::<mach2::port::mach_port_t>()) as u64,
        );
    }

    Ok(())
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct ThreadAffinityPolicy {
    affinity_tag: i32,
}

#[cfg(not(target_os = "macos"))]
pub fn set_process_affinity(_pid: u32, _cpu_list: &str) -> Result<(), String> {
    // No-op on non-macOS
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_cpu() {
        let mask = parse_cpu_list("0").unwrap();
        assert_eq!(mask, 1);
    }

    #[test]
    fn test_parse_multiple_cpus() {
        let mask = parse_cpu_list("0,2,4").unwrap();
        assert_eq!(mask, 0b10101);
    }

    #[test]
    fn test_parse_cpu_range() {
        let mask = parse_cpu_list("0-3").unwrap();
        assert_eq!(mask, 0b1111);
    }

    #[test]
    fn test_parse_mixed() {
        let mask = parse_cpu_list("0-1,4,6-7").unwrap();
        // 0-1 = bits 0,1; 4 = bit 4; 6-7 = bits 6,7
        assert_eq!(mask, (1 << 0) | (1 << 1) | (1 << 4) | (1 << 6) | (1 << 7));
    }

    #[test]
    fn test_parse_empty() {
        let mask = parse_cpu_list("").unwrap();
        assert_eq!(mask, 0);
    }

    #[test]
    fn test_parse_empty_with_spaces() {
        let mask = parse_cpu_list("   ").unwrap();
        assert_eq!(mask, 0);
    }

    #[test]
    fn test_parse_single_high_cpu() {
        let mask = parse_cpu_list("63").unwrap();
        assert_eq!(mask, 1 << 63);
    }

    #[test]
    fn test_parse_invalid_non_numeric() {
        assert!(parse_cpu_list("abc").is_err());
    }

    #[test]
    fn test_parse_invalid_out_of_range() {
        assert!(parse_cpu_list("64").is_err());
        assert!(parse_cpu_list("0-64").is_err());
    }

    #[test]
    fn test_parse_invalid_reversed_range() {
        assert!(parse_cpu_list("3-1").is_err());
    }

    #[test]
    fn test_parse_with_spaces() {
        let mask = parse_cpu_list(" 0 , 2 , 4 ").unwrap();
        assert_eq!(mask, 0b10101);
    }

    #[test]
    fn test_parse_range_with_spaces() {
        let mask = parse_cpu_list("0 - 3").unwrap();
        assert_eq!(mask, 0b1111);
    }

    #[test]
    fn test_parse_all_cores_0_to_63() {
        let mask = parse_cpu_list("0-63").unwrap();
        assert_eq!(mask, u64::MAX);
    }
}
