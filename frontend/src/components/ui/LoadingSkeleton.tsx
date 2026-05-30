interface LoadingSkeletonProps {
  lines?: number;
}

export function LoadingSkeleton({ lines = 5 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-3 p-6 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-800 rounded"
          style={{ width: `${60 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  );
}
