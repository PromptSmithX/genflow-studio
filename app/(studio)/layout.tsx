import { StudioShell } from "@/components/app-shell/studio-shell";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
