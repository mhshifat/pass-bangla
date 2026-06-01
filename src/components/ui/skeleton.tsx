import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // `pb-shimmer` adds a sweeping highlight (see globals.css); it gracefully
      // becomes a static block under reduced-motion.
      className={cn("bg-accent pb-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
