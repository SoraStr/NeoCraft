import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface JvmParam {
  key: string;
  label: string;
  description: string;
  type: 'bool' | 'number' | 'select' | 'text';
  flag?: string;        // the -XX:+Foo or -XX:-Foo flag
  prefix?: string;      // for number params, e.g. "-XX:MaxGCPauseMillis="
  suffix?: string;      // for number params, e.g. "M" or "m"
  options?: { label: string; value: string }[]; // for select type
  category: 'memory' | 'gc' | 'g1' | 'perf' | 'debug';
}

const JVM_PARAMS: JvmParam[] = [
  // ── Memory ──
  {
    key: 'Xmx', label: '最大堆内存 (-Xmx)', description: 'Java 堆内存上限，推荐设为物理内存的 50%-80%。支持 2G / 512M 等格式',
    type: 'text', prefix: '-Xmx', category: 'memory',
  },
  {
    key: 'Xms', label: '初始堆内存 (-Xms)', description: 'JVM 启动时分配的堆内存，建议与 -Xmx 相同以避免运行时扩容开销。支持 2G / 512M 等格式',
    type: 'text', prefix: '-Xms', category: 'memory',
  },

  // ── GC ──
  {
    key: 'UseG1GC', label: 'G1 垃圾回收器', description: '适合大内存（>4G）的低延迟 GC，推荐开启',
    type: 'bool', flag: '-XX:+UseG1GC', category: 'gc',
  },
  {
    key: 'UseZGC', label: 'ZGC 垃圾回收器', description: '超低延迟 GC（<1ms），需要 Java 21+ 和大内存（>8G）',
    type: 'bool', flag: '-XX:+UseZGC', category: 'gc',
  },
  {
    key: 'ParallelRefProcEnabled', label: '并行引用处理', description: '加快引用对象（WeakRef/SoftRef）的处理速度',
    type: 'bool', flag: '-XX:+ParallelRefProcEnabled', category: 'gc',
  },
  {
    key: 'DisableExplicitGC', label: '禁用显式 GC', description: '忽略 System.gc() 调用，防止插件触发 Full GC',
    type: 'bool', flag: '-XX:+DisableExplicitGC', category: 'gc',
  },
  {
    key: 'MaxGCPauseMillis', label: '最大 GC 暂停 (ms)', description: 'G1/ZGC 目标暂停时间，越小延迟越低但吞吐量下降',
    type: 'number', prefix: '-XX:MaxGCPauseMillis=', category: 'gc',
  },

  // ── G1 专用 ──
  {
    key: 'G1NewSizePercent', label: 'G1 新生代下限 (%)', description: 'G1 新生代最小占比，Aikar 推荐 20-30',
    type: 'number', prefix: '-XX:G1NewSizePercent=', category: 'g1',
  },
  {
    key: 'G1MaxNewSizePercent', label: 'G1 新生代上限 (%)', description: 'G1 新生代最大占比，Aikar 推荐 40',
    type: 'number', prefix: '-XX:G1MaxNewSizePercent=', category: 'g1',
  },
  {
    key: 'G1HeapRegionSize', label: 'G1 Region 大小', description: '堆分区大小，推荐设为 2 的幂次，使堆为 2048 的倍数',
    type: 'select', prefix: '-XX:G1HeapRegionSize=',
    options: [
      { label: '4M', value: '4M' }, { label: '8M', value: '8M' },
      { label: '16M', value: '16M' }, { label: '32M', value: '32M' },
    ],
    category: 'g1',
  },
  {
    key: 'G1ReservePercent', label: 'G1 保留空间 (%)', description: '预留空间防止晋升失败，Aikar 推荐 20',
    type: 'number', prefix: '-XX:G1ReservePercent=', category: 'g1',
  },
  {
    key: 'G1HeapWastePercent', label: 'G1 堆浪费阈值 (%)', description: 'G1 停止回收的堆浪费百分比，Aikar 推荐 5',
    type: 'number', prefix: '-XX:G1HeapWastePercent=', category: 'g1',
  },
  {
    key: 'G1MixedGCCountTarget', label: 'G1 混合 GC 次数', description: '混合 GC 周期中的 GC 次数，Aikar 推荐 4',
    type: 'number', prefix: '-XX:G1MixedGCCountTarget=', category: 'g1',
  },
  {
    key: 'InitiatingHeapOccupancyPercent', label: 'GC 触发堆占用 (%)', description: '堆占用率达此值时触发并发 GC，Aikar 推荐 15',
    type: 'number', prefix: '-XX:InitiatingHeapOccupancyPercent=', category: 'g1',
  },
  {
    key: 'G1MixedGCLiveThresholdPercent', label: 'G1 混合 GC 存活阈值 (%)', description: 'Region 存活对象低于此比例才回收，Aikar 推荐 90',
    type: 'number', prefix: '-XX:G1MixedGCLiveThresholdPercent=', category: 'g1',
  },

  // ── 性能 ──
  {
    key: 'AlwaysPreTouch', label: '启动时预分配内存', description: '启动时立刻分配所有堆内存，避免运行时按需分配的开销',
    type: 'bool', flag: '-XX:+AlwaysPreTouch', category: 'perf',
  },
  {
    key: 'UnlockExperimentalVMOptions', label: '允许实验性参数', description: '解锁实验性 JVM 选项（某些高级参数需要）',
    type: 'bool', flag: '-XX:+UnlockExperimentalVMOptions', category: 'perf',
  },
  {
    key: 'UseLargePages', label: '大页内存', description: '使用 Huge Pages 减少 TLB miss，需要系统配置（谨慎开启）',
    type: 'bool', flag: '-XX:+UseLargePages', category: 'perf',
  },

  // ── 调试 ──
  {
    key: 'PrintGCDetails', label: '输出 GC 详情', description: '在日志中打印每次 GC 的详细信息，用于性能分析',
    type: 'bool', flag: '-XX:+PrintGCDetails', category: 'debug',
  },
];

const CATEGORIES = [
  { key: 'memory', labelKey: 'jvmCatMemory' },
  { key: 'gc', labelKey: 'jvmCatGC' },
  { key: 'g1', labelKey: 'jvmCatG1' },
  { key: 'perf', labelKey: 'jvmCatPerf' },
  { key: 'debug', labelKey: 'jvmCatDebug' },
] as const;

interface Props {
  open: boolean;
  initialArgs: string;
  onClose: () => void;
  onApply: (args: string) => void;
}

export function JvmArgsDialog({ open, initialArgs, onClose, onApply }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [initialized, setInitialized] = useState(false);

  // Parse initial args into values on first open
  if (open && !initialized) {
    const parsed: Record<string, string | boolean> = {};
    const tokens = initialArgs.split(/\s+/).filter(Boolean);
    for (const param of JVM_PARAMS) {
      if (param.type === 'bool' && param.flag) {
        parsed[param.key] = tokens.includes(param.flag.split('+')[0] + '+' + param.flag.split('+')[1]);
      } else if (param.prefix) {
        const prefix = param.prefix;
        const found = tokens.find(t => t.startsWith(prefix));
        parsed[param.key] = found ? found.slice(prefix.length) : '';
      }
    }
    setValues(parsed);
    setInitialized(true);
  }

  if (!open) return null;

  /** Parse memory string like "2G", "512M", "1G" to megabytes for comparison. */
  const parseMemoryMB = (s: string): number => {
    const m = s.trim().match(/^(\d+)\s*(G|M|K)$/i);
    if (!m) return 0;
    const num = parseInt(m[1], 10);
    switch (m[2].toUpperCase()) {
      case 'G': return num * 1024;
      case 'M': return num;
      case 'K': return num / 1024;
    }
    return 0;
  };

  const handleBool = (key: string) => {
    setValues(v => ({ ...v, [key]: !v[key] }));
  };

  const handleValue = (key: string, value: string) => {
    setValues(v => {
      const next = { ...v, [key]: value };
      // Enforce Xms <= Xmx
      const xmx = String(next['Xmx'] || '');
      const xms = String(next['Xms'] || '');
      const mxMB = parseMemoryMB(xmx);
      const msMB = parseMemoryMB(xms);
      if (mxMB > 0 && msMB > 0 && msMB > mxMB) {
        if (key === 'Xmx') {
          // Raising Xmx below current Xms — bump Xms down to match
          next['Xms'] = xmx;
        } else {
          // Raising Xms above current Xmx — bump Xmx up to match
          next['Xmx'] = xms;
        }
      }
      return next;
    });
  };

  const buildArgs = (): string => {
    const parts: string[] = [];
    for (const param of JVM_PARAMS) {
      const val = values[param.key];
      if (param.type === 'bool' && val === true && param.flag) {
        parts.push(param.flag);
      } else if (param.prefix && val && String(val).trim()) {
        parts.push(param.prefix + String(val).trim());
      }
    }
    return parts.join(' ');
  };

  const handleApply = () => {
    onApply(buildArgs());
    handleClose();
  };

  const handleClose = () => {
    setInitialized(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-app-surface rounded-xl shadow-2xl border border-app-border w-full max-w-2xl max-h-[80vh] flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <h2 className="text-lg font-semibold text-app-text">
            {t('setup.jvmCustomTitle') || '自定义 JVM 参数'}
          </h2>
          <button onClick={handleClose} className="text-app-text-muted hover:text-app-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <datalist id="jvm-suggest-Xmx">
          <option value="2G" /><option value="4G" /><option value="6G" />
          <option value="8G" /><option value="12G" /><option value="16G" />
          <option value="512M" /><option value="1G" /><option value="3G" />
        </datalist>
        <datalist id="jvm-suggest-Xms">
          <option value="1G" /><option value="2G" /><option value="4G" />
          <option value="8G" /><option value="512M" /><option value="256M" />
        </datalist>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {CATEGORIES.map((cat) => {
            const params = JVM_PARAMS.filter(p => p.category === cat.key);
            if (params.length === 0) return null;
            return (
              <div key={cat.key}>
                <h3 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2">
                  {t(cat.labelKey) || cat.key}
                </h3>
                <div className="space-y-2.5">
                  {params.map((param) => (
                    <div key={param.key} className="flex items-start gap-3">
                      {/* Checkbox / Input */}
                      <div className="flex-shrink-0 mt-0.5">
                        {param.type === 'bool' ? (
                          <input
                            type="checkbox"
                            checked={!!values[param.key]}
                            onChange={() => handleBool(param.key)}
                            className="w-4 h-4 rounded accent-app-accent"
                          />
                        ) : param.type === 'select' && param.options ? (
                          <select
                            value={String(values[param.key] || '')}
                            onChange={(e) => handleValue(param.key, e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-app-border bg-app-input text-app-text outline-none focus:border-app-accent"
                          >
                            <option value="">{t('setup.jvmNotSet') || '未设置'}</option>
                            {param.options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : param.type === 'text' ? (
                          <input
                            type="text"
                            value={String(values[param.key] || '')}
                            onChange={(e) => handleValue(param.key, e.target.value)}
                            placeholder="2G"
                            list={`jvm-suggest-${param.key}`}
                            className="w-24 px-2 py-1 text-xs rounded border border-app-border bg-app-input text-app-text outline-none focus:border-app-accent font-mono"
                          />
                        ) : (
                          <input
                            type="number"
                            value={String(values[param.key] || '')}
                            onChange={(e) => handleValue(param.key, e.target.value)}
                            placeholder={t('setup.jvmNotSet') || '未设置'}
                            className="w-20 px-2 py-1 text-xs rounded border border-app-border bg-app-input text-app-text outline-none focus:border-app-accent"
                          />
                        )}
                      </div>
                      {/* Label + Desc */}
                      <div className="flex-1 min-w-0">
                        <label className="text-sm font-medium text-app-text cursor-pointer" onClick={() => param.type === 'bool' && handleBool(param.key)}>
                          {param.label}
                        </label>
                        <p className="text-xs text-app-text-muted mt-0.5 leading-relaxed">
                          {param.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-app-border bg-app-bg">
          <div className="text-xs text-app-text-muted truncate max-w-sm font-mono">
            {buildArgs() || (t('setup.jvmEmpty') || '未选择参数')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm rounded-md bg-app-input hover:bg-app-border text-app-text border border-app-border transition-colors"
            >
              {t('setup.back') || '取消'}
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm rounded-md bg-app-accent hover:bg-app-accent-hover text-white font-medium transition-colors"
            >
              {t('setup.jvmApply') || '应用'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
