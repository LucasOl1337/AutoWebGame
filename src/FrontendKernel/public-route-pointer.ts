export type PublicRoutePointer = "canonical" | "legacy";

/**
 * One cutover pointer owns the whole public route seam. Rollback is
 * `VITE_PUBLIC_ROUTE_POINTER=legacy npm run deploy:cloudflare`; an absent or
 * invalid value stays fail-closed on the legacy surface.
 */
export function resolvePublicRoutePointer(configured: unknown): PublicRoutePointer {
  return configured === "canonical" ? "canonical" : "legacy";
}

export const PUBLIC_ROUTE_POINTER: PublicRoutePointer = resolvePublicRoutePointer(
  import.meta.env?.VITE_PUBLIC_ROUTE_POINTER,
);
