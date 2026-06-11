import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string;
  alt?: string;
  status?: "online" | "offline" | "away";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  children?: React.ReactNode;
}

export const Avatar = ({ className, src, alt = "Avatar", status, size = "md", children }: AvatarProps) => {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-24 w-24",
  };

  const statusColors = {
    online: "bg-success",
    offline: "bg-muted-foreground",
    away: "bg-accent",
  };

  return (
    <div className={cn("relative inline-block overflow-hidden rounded-full border border-border shadow-sm flex-shrink-0", sizes[size], className)}>
      {children ? (
        children
      ) : src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 96px, 96px"
          className="object-cover"
        />
      ) : (
        <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
          {alt.substring(0, 2).toUpperCase()}
        </div>
      )}
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
            statusColors[status]
          )}
        />
      )}
    </div>
  );
};
