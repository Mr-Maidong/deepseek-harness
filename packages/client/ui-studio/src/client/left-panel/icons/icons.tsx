import type { ReactElement, ReactNode, SVGProps } from 'react'

/** Shared props for Studio's hand-drawn outline icons. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...props }: IconProps & { children: ReactNode }): ReactElement {
  return <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden="true" {...props}>{children}</svg>
}

function AssetIcon({ className, size = 16 }: IconProps): ReactElement {
  return <span className={className} style={{ width: size, height: size }} aria-hidden="true" />
}

/** WorkBase section icon. */
export function WorkBaseIcon(props: IconProps): ReactElement {
  return <AssetIcon {...props} />
}

/** FileTree section icon. */
export function FileTreeIcon(props: IconProps): ReactElement {
  return <AssetIcon {...props} />
}

/** Plus action icon. */
export function AddIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /></Icon>
}

/** Add-workspace icon: folder outline with an integrated plus mark. */
export function AddWorkspaceIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="M2.5 4.25A1.25 1.25 0 0 1 3.75 3h3l1.35 1.5h4.15a1.25 1.25 0 0 1 1.25 1.25v3.1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M2.5 6.25v4.5A1.25 1.25 0 0 0 3.75 12h5.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M11.5 9v4M9.5 11h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></Icon>
}

/** Git branch glyph: two nodes on a trunk with one node branching in. */
export function GitBranchIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="M4.5 5.2v5.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><circle cx="4.5" cy="3.6" r="1.6" stroke="currentColor" strokeWidth="1.25" /><circle cx="4.5" cy="12.4" r="1.6" stroke="currentColor" strokeWidth="1.25" /><circle cx="11.5" cy="4.4" r="1.6" stroke="currentColor" strokeWidth="1.25" /><path d="M11.5 6v1.4a2.6 2.6 0 0 1-2.6 2.6H7.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></Icon>
}

/** Folder outline icon. */
export function FolderIcon(props: IconProps & { open?: boolean }): ReactElement {
  const { className, size } = props
  return size === undefined
    ? <AssetIcon className={className} />
    : <AssetIcon className={className} size={size} />
}

/** Directory disclosure icon. */
export function ChevronIcon({ open = false, className, ...props }: IconProps & { open?: boolean }): ReactElement {
  const stateClassName = open ? 'studio-icon-open' : undefined
  const mergedClassName = [className, stateClassName].filter(Boolean).join(' ')
  return <AssetIcon className={mergedClassName || undefined} {...props} />
}

/** Session row icon. */
export function SessionIcon(props: IconProps): ReactElement {
  return <AssetIcon {...props} />
}

/** Edit action icon. */
export function EditIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="m3.25 11.9-.45 1.8 1.8-.45 7.65-7.65a1.27 1.27 0 0 0-1.8-1.8L2.8 11.45Z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" /><path d="m9.55 4.2 2.25 2.25" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" /></Icon>
}

/** Archive/remove action icon. */
export function DeleteIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="M3.5 4.5h9M6 4.5V3.25h4V4.5M5 6.25v5.5m3-5.5v5.5m3-5.5v5.5M4.25 4.5l.5 8.25h6.5l.5-8.25" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" /></Icon>
}

/** Send-to-chat action icon. */
export function SendIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="m2.75 7.75 10.5-4-3.5 10.5-2.25-4.25-4.75-2.25Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="m7.5 10 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></Icon>
}

/** Close action icon. */
export function CloseIcon(props: IconProps): ReactElement {
  return <Icon {...props}><path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></Icon>
}
