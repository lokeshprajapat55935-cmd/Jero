import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton = ({ className, width, height, circle, ...props }: SkeletonProps) => {
  return (
    <div
      className={cn(
        "animate-shimmer bg-muted rounded-md bg-gradient-to-r from-muted via-muted/60 to-muted",
        circle ? "rounded-full" : "",
        className
      )}
      style={{
        width: width,
        height: height,
      }}
      {...props}
    />
  );
};
