import React from "react";
import { cn } from "@/lib/utils";

export interface BottomBarItemProps extends React.ComponentPropsWithoutRef<"button"> {
  as?: React.ElementType;
}

export function BottomBarItem({
  children,
  className,
  as: Component = "button",
  ...props
}: BottomBarItemProps) {
  return (
    <Component
      className={cn(
        "flex items-center gap-1.5 h-full px-2.5 transition-none",
        "hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground cursor-pointer",
        "focus-visible:outline-none focus-visible:bg-black/10 dark:focus-visible:bg-white/10",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
