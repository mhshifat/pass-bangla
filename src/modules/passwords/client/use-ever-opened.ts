import { useState } from "react"

/** True once `open` has been true at least once; lets lazy dialogs stay mounted after first open. */
export function useEverOpened(open: boolean): boolean {
  const [everOpened, setEverOpened] = useState(open)
  if (open && !everOpened) setEverOpened(true)
  return everOpened
}
