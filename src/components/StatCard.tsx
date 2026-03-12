import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
}

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon }: StatCardProps) {
  const changeColor = changeType === "positive" ? "text-success" : changeType === "negative" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="glass-card p-5 animate-slide-in">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {change && <p className={`text-xs font-medium ${changeColor}`}>{change}</p>}
        </div>
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
