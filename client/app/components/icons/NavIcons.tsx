"use client";

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  strokeWidth?: number;
};

function IconBase({
  children,
  strokeWidth = 0,
  className,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      data-stroke-width={strokeWidth}
      {...props}
    >
      {children}
    </svg>
  );
}

function getPathPaintProps(strokeWidth: number | undefined) {
  return strokeWidth && strokeWidth > 0
    ? {
        stroke: "currentColor",
        strokeWidth,
        paintOrder: "stroke fill" as const,
        strokeLinejoin: "round" as const,
        strokeLinecap: "round" as const,
      }
    : {};
}

export function LogoIcon({ strokeWidth = 0, ...props }: IconProps) {
  const paintProps = getPathPaintProps(strokeWidth);
  return (
    <IconBase viewBox="0 0 35 35" {...props}>
      <path
        d="M24.6094 0C30.348 0 35 4.65199 35 10.3906V35H28.4375V10.3906C28.4375 8.27641 26.7236 6.5625 24.6094 6.5625C22.4952 6.5625 20.7812 8.27641 20.7812 10.3906V24.6094C20.7812 30.348 16.1293 35 10.3906 35C4.65199 35 0 30.348 0 24.6094V0H6.5625V24.6094C6.5625 26.7236 8.27641 28.4375 10.3906 28.4375C12.5048 28.4375 14.2188 26.7236 14.2188 24.6094V10.3906C14.2188 4.65199 18.8707 0 24.6094 0Z"
        fill="currentColor"
        {...paintProps}
      />
    </IconBase>
  );
}

export function SearchIcon({ strokeWidth = 0, ...props }: IconProps) {
  const paintProps = getPathPaintProps(strokeWidth);
  return (
    <IconBase viewBox="0 0 40 40" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M27.3215 27.1826L34.6429 35.774L33.373 36.8653L26.0317 28.274C23.5052 30.1919 20.6613 31.1509 17.4999 31.1509C15.5819 31.1509 13.7466 30.7772 11.994 30.0299C10.2414 29.2825 8.73341 28.2773 7.47013 27.014C6.20685 25.7508 5.20156 24.2429 4.45427 22.4902C3.70698 20.7375 3.3333 18.9022 3.33325 16.9843C3.3332 15.0663 3.70687 13.231 4.45427 11.4783C5.20166 9.72567 6.20695 8.21773 7.47013 6.9545C8.7333 5.69127 10.2412 4.68599 11.994 3.93864C13.7467 3.1913 15.582 2.81763 17.4999 2.81763C19.4178 2.81763 21.2531 3.1913 23.0058 3.93864C24.7585 4.68599 26.2665 5.69127 27.5297 6.9545C28.7928 8.21773 29.7981 9.72567 30.5455 11.4783C31.2929 13.231 31.6666 15.0663 31.6665 16.9843C31.6665 18.9552 31.2829 20.8202 30.5158 22.5795C29.7486 24.3388 28.6837 25.8732 27.3213 27.1827L27.3215 27.1826ZM17.5001 29.4842C19.7619 29.4842 21.8519 28.9253 23.7699 27.8075C25.6879 26.6898 27.2058 25.1719 28.3235 23.254C29.4412 21.336 30.0001 19.246 30.0001 16.9841C30.0002 14.7222 29.4413 12.6322 28.3235 10.7143C27.2057 8.7963 25.6878 7.27846 23.7699 6.16075C21.852 5.04304 19.762 4.48419 17.5001 4.48419C15.2381 4.48419 13.1481 5.04304 11.2302 6.16075C9.31229 7.27846 7.79445 8.7963 6.67669 10.7143C5.55893 12.6322 5.00007 14.7222 5.00013 16.9841C5.00018 19.246 5.55903 21.336 6.67669 23.254C7.79435 25.1719 9.31218 26.6898 11.2302 27.8075C13.1482 28.9253 15.2382 29.4842 17.5001 29.4842Z"
        fill="currentColor"
        {...paintProps}
      />
    </IconBase>
  );
}

export function LibraryIcon({ strokeWidth = 0, ...props }: IconProps) {
  const paintProps = getPathPaintProps(strokeWidth);
  return (
    <IconBase viewBox="0 0 40 40" {...props}>
      <path
        d="M22.7579 6.38897L35.7539 35.5755L34.246 36.2501L21.25 7.06358L22.7579 6.38897ZM5 36.2302V6.23022H6.66672V36.2302H5ZM15 36.2302V6.23022H16.6667V36.2302H15Z"
        fill="currentColor"
        {...paintProps}
      />
    </IconBase>
  );
}

export function SettingsIcon({ strokeWidth = 0, ...props }: IconProps) {
  const paintProps = getPathPaintProps(strokeWidth);
  return (
    <IconBase viewBox="0 0 40 40" {...props}>
      <path
        d="M20 12.9167A7.08333 7.08333 0 1 0 20 27.0834A7.08333 7.08333 0 1 0 20 12.9167ZM20 14.5834A5.41667 5.41667 0 1 1 20 25.4167A5.41667 5.41667 0 1 1 20 14.5834ZM19.1667 4.16675H20.8333L21.5658 8.56467C23.0275 8.84484 24.3737 9.41157 25.5442 10.2059L29.2283 7.6765L30.4067 8.85492L27.8775 12.539C28.6718 13.7094 29.2385 15.0557 29.5187 16.5174L33.9167 17.2498V18.9165L29.5187 19.6489C29.2385 21.1107 28.6718 22.4569 27.8775 23.6274L30.4067 27.3114L29.2283 28.4899L25.5442 25.9606C24.3737 26.7548 23.0275 27.3216 21.5658 27.6018L20.8333 32.0001H19.1667L18.4342 27.6018C16.9725 27.3216 15.6263 26.7548 14.4558 25.9606L10.7717 28.4899L9.59331 27.3114L12.1225 23.6274C11.3282 22.4569 10.7615 21.1107 10.4813 19.6489L6.08337 18.9165V17.2498L10.4813 16.5174C10.7615 15.0557 11.3282 13.7094 12.1225 12.539L9.59331 8.85492L10.7717 7.6765L14.4558 10.2059C15.6263 9.41157 16.9725 8.84484 18.4342 8.56467L19.1667 4.16675Z"
        fill="currentColor"
        {...paintProps}
      />
    </IconBase>
  );
}
