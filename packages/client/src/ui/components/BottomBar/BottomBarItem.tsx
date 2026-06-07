import React from "react";
import { cn } from "@/lib/utils";

export type BottomBarItemProps<T extends React.ElementType> = {
  as?: T;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as">;

export function BottomBarItem<T extends React.ElementType>({
  children,
  className,
  as,
  ...props
}: BottomBarItemProps<T>) {
  const Component = as || "button";
  return (
    <Component
      className={cn(
        "flex items-center gap-1.5 h-full px-2.5 transition-none",
        "hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground cursor-pointer",
        "focus-visible:outline-none focus-visible:bg-black/10 dark:focus-visible:bg-white/10",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
