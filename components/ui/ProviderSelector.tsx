"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Server, ChevronDown, Check } from "lucide-react";
import {
  getActiveProviderId,
  getAvailableProviders,
  setActiveProvider,
} from "@/app/actions/movie";
import FocusElementProvider from "../providers/FocusElementProvider";

export interface ProviderOption {
  id: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ProviderSelectorProps {
  /** Map of provider ID to disabled flag or disabled reason string */
  disabledProviders?: Record<string, boolean | string>;
}

const DEFAULT_DISABLED_PROVIDERS: Record<string, boolean | string> = {
  "solo-latino": "Deshabilitado",
};

export function ProviderSelector({
  disabledProviders = DEFAULT_DISABLED_PROVIDERS,
}: ProviderSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [activeProvider, setActiveProviderState] = useState<string>("gnula");

  const isProviderDisabled = (id: string): boolean => {
    const val = disabledProviders[id];
    return typeof val === "string" ? Boolean(val) : Boolean(val);
  };

  const getDisabledReason = (id: string): string | undefined => {
    const val = disabledProviders[id];
    return typeof val === "string" ? val : val ? "Deshabilitado" : undefined;
  };

  const buildProviderOption = (p: { id: string; name: string }): ProviderOption => ({
    id: p.id,
    name: p.name,
    disabled: isProviderDisabled(p.id),
    disabledReason: getDisabledReason(p.id),
  });

  const [providers, setProviders] = useState<ProviderOption[]>([
    buildProviderOption({ id: "gnula", name: "Gnula HD" }),
    buildProviderOption({ id: "solo-latino", name: "Solo Latino" }),
    buildProviderOption({ id: "serieslan", name: "SeriesLan" }),
    buildProviderOption({ id: "megadede", name: "Megadede" }),
  ]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [active, available] = await Promise.all([
          getActiveProviderId(),
          getAvailableProviders(),
        ]);
        if (isMounted) {
          const mapped =
            available && available.length > 0
              ? available.map(buildProviderOption)
              : [
                  buildProviderOption({ id: "gnula", name: "Gnula HD" }),
                  buildProviderOption({ id: "solo-latino", name: "Solo Latino" }),
                  buildProviderOption({ id: "serieslan", name: "SeriesLan" }),
                  buildProviderOption({ id: "megadede", name: "Megadede" }),
                ];
          setProviders(mapped);

          // If the currently active provider is disabled, auto-switch to first available enabled provider
          if (active && isProviderDisabled(active)) {
            const fallback = mapped.find((p) => !p.disabled)?.id || "gnula";
            setActiveProviderState(fallback);
            await setActiveProvider(fallback);
            router.refresh();
          } else if (active) {
            setActiveProviderState(active);
          }
        }
      } catch (err) {
        console.warn("[ProviderSelector] Error loading providers:", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelect = (id: string, disabled?: boolean) => {
    if (disabled) return;

    if (id === activeProvider) {
      setIsOpen(false);
      return;
    }
    setActiveProviderState(id);
    setIsOpen(false);
    startTransition(async () => {
      await setActiveProvider(id);
      router.refresh();
    });
  };

  const currentProviderName =
    providers.find((p) => p.id === activeProvider)?.name || "Proveedor";

  return (
    <div className="relative">
      <FocusElementProvider
        className="rounded-lg group"
        strokeSize={0}
        onEnterPress={() => setIsOpen((prev) => !prev)}
        styleFocus={{ outline: "2px solid #e50914" }}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 border cursor-pointer select-none ${
            isPending ? "opacity-50 pointer-events-none" : ""
          } ${
            isOpen
              ? "bg-white/10 border-white/20 text-white"
              : "bg-white/[0.04] border-white/[0.08] text-gray-300 hover:text-white hover:bg-white/[0.08]"
          }`}
          aria-label="Seleccionar proveedor de streaming"
        >
          <Server size={14} className="text-[#e50914] shrink-0" />
          <span className="hidden sm:inline max-w-[90px] truncate">
            {currentProviderName}
          </span>
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </FocusElementProvider>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#131519] border border-white/10 shadow-2xl z-40 py-1.5 overflow-hidden backdrop-blur-md">
            <div className="px-3 py-1.5 border-b border-white/[0.06] mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Fuente / Driver
              </span>
            </div>
            {providers.map((p) => {
              const selected = p.id === activeProvider;
              const isDisabled = Boolean(p.disabled);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelect(p.id, isDisabled)}
                  aria-disabled={isDisabled}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs sm:text-sm text-left transition-colors duration-150 ${
                    isDisabled
                      ? "text-gray-500 opacity-50 cursor-not-allowed select-none"
                      : selected
                        ? "text-white font-semibold bg-white/[0.08] cursor-pointer"
                        : "text-gray-300 hover:text-white hover:bg-white/[0.04] cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{p.name}</span>
                    {isDisabled && (
                      <span className="text-[10px] font-medium text-amber-400/90 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.2 rounded shrink-0">
                        {p.disabledReason || "Deshabilitado"}
                      </span>
                    )}
                  </div>
                  {selected && !isDisabled && (
                    <Check size={14} className="text-[#e50914] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
