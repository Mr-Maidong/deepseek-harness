/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useState } from 'react'
import { RunningMatrix, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

interface RunningStatusProps {
  readonly startTime: number | undefined
  readonly t: ChatViewSlotProps['t']
}

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * The label is present from the first frame, standing at its one-second floor
 * until the Turn's start time arrives.
 * @param props - Current Turn start time and localized copy.
 * @returns the blue running indicator; mount only while the Session is running.
 */
export const RunningStatus = memo(function RunningStatus({ startTime, t }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startTime === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime])
  // Before the Turn's start time arrives the clock stands at its one-second
  // floor, so the label is present from the first frame.
  const elapsed = `${t('chat.runningFor')}${formatRunDuration(Math.max(1000, now - (startTime ?? now)), t).map(part => part.text).join('')}`
  return (
    <div className={css.running} data-chat-running>
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningMatrix />
        <TextShimmer active className={css.runningText}>{elapsed}</TextShimmer>
      </span>
    </div>
  )
})
