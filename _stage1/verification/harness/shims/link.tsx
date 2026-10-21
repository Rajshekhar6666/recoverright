import { navigate } from "./nav";
export default function Link({ href, children, target, onClick, ...r }: any) {
  return <a href={href} target={target} {...r} onClick={(e) => { onClick?.(e); if (e.defaultPrevented || target === "_blank" || e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); navigate(href); }}>{children}</a>;
}
