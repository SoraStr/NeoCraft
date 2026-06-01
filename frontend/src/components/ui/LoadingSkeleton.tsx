interface LoadingSkeletonProps {
  lines?: number;
}

export function LoadingSkeleton({ lines = 5 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-3 p-6 animate-fade-in">
      {/* Title skeleton */}
      <div className="h-7 w-40 bg-app-border rounded-lg animate-pulse-subtle mb-6" />
      {/* Content lines */}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-4 bg-app-border-light rounded-md animate-pulse-subtle"
            style={{ width: `${Math.min(20 + Math.random() * 15, 35)}%` }}
          />
          <div
            className="h-4 bg-app-border-light rounded-md animate-pulse-subtle"
            style={{ width: `${Math.min(40 + Math.random() * 35, 75)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
