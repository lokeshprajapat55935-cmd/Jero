"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glass" | "outline" | "soft";
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", hoverable = false, children, ...props }, ref) => {
    const variants = {
      default: "premium-card text-card-foreground",
      glass: "glass shadow-soft",
      outline: "bg-transparent border border-border hover:border-primary/45 transition-colors",
      soft: "bg-secondary/45 text-card-foreground border border-transparent",
    };

    return (
      <motion.div
        ref={ref as any}
        whileHover={hoverable ? { y: -4, transition: { duration: 0.2 } } : {}}
        className={cn(
          "rounded-2xl p-6 transition-all duration-200",
          variants[variant],
          className
        )}
        {...(props as any)}
      >
        {children}
      </motion.div>
    );
  }
);

Card.displayName = "Card";
