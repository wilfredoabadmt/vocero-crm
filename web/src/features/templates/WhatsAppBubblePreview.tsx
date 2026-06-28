import { Check } from 'lucide-react';

/** Burbuja fiel al estilo de WhatsApp para previsualizar plantillas. */
export function WhatsAppBubblePreview({ body, variables = [] }: { body: string; variables?: string[] }) {
  const parts = body.split(/(\{\{\d+\}\})/g);
  const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-lg bg-[#efeae2] p-4 dark:bg-[#0b141a]" data-testid="wa-preview">
      <div className="relative ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 shadow dark:bg-[#005c4b]">
        <p className="whitespace-pre-wrap break-words text-sm text-[#111b21] dark:text-[#e9edef]">
          {parts.map((part, i) => {
            const match = part.match(/^\{\{(\d+)\}\}$/);
            if (match) {
              const value = variables[Number(match[1]) - 1];
              return value ? (
                <span key={i} className="font-medium">
                  {value}
                </span>
              ) : (
                <span key={i} className="rounded bg-black/10 px-1 font-mono text-xs dark:bg-white/15">
                  {part}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </p>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-[#8696a0]">
          {now}
          <Check className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}
