import type { ReactNode } from "react";

export function RequiredMark() {
  return <span className="text-danger text-base font-semibold leading-none">*</span>;
}

export function AuthPanel({
  title,
  introduction,
  requiredFields = false,
  variant = "form",
  children,
}: {
  title: string;
  introduction?: string;
  requiredFields?: boolean;
  variant?: "form" | "card";
  children: ReactNode;
}) {
  return (
    <div className={`w-full mx-auto flex flex-col [&_.input]:min-h-11 [&_.input]:bg-bg [&_.input]:text-base [&_.field-label]:mb-0 [&_.field-label]:text-[13px] [&_.field-label]:text-muted [&_.btn]:min-h-11 ${variant === "card" ? "max-w-sm gap-6 border border-divider bg-bg p-6" : "max-w-lg gap-8 py-4"}`}>
      <header className="flex flex-col gap-2">
        <h2 className="m-0 text-2xl">{title}</h2>
        {introduction && <p className="m-0 text-muted text-sm">{introduction}</p>}
        {requiredFields && (
          <p className="m-0 text-muted text-[13px]">Fields marked with <RequiredMark /> are required.</p>
        )}
      </header>
      {children}
    </div>
  );
}
