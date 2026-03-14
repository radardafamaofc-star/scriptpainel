import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function NoticeAlertModal() {
  const { user, role, loading } = useAuth();
  const [notice, setNotice] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user || role === "admin") return;

    const fetchNotice = async () => {
      const { data } = await supabase
        .from("notices")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setNotice(data);
        setOpen(true);
      }
    };

    fetchNotice();
  }, [user, role, loading]);

  if (!notice) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{notice.title}</DialogTitle>
        </DialogHeader>
        <div
          className="text-sm text-muted-foreground leading-relaxed prose prose-sm prose-invert max-w-none [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: notice.content }}
        />
        <DialogFooter>
          <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
