"use client";

import { useEffect, useMemo } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";
import { restoreCloudLibrary } from "../lib/local-library";

export default function CloudLibraryBridge() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      return;
    }

    const restoreLibrary = async (userId: string) => {
      try {
        const response = await fetch("/api/library/sync", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = (await response.json()) as unknown;
        if (!isMounted) return;

        await restoreCloudLibrary(payload);
      } catch {}
    };

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;
      await restoreLibrary(user.id);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id;
      if (!isMounted || !userId) return;
      void restoreLibrary(userId);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}
