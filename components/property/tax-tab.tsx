import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/utils";
import type { Property, Tax } from "./types";

export function TaxTab({ property, tax }: { property: Property; tax: Tax[] }) {
  const latest = tax[0];
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tax status history</CardTitle>
          <div className="flex gap-3 text-xs">
            {property.county === "riverside" && <a className="inline-flex items-center gap-1 text-primary" href="https://countytreasurer.org/inventory-all-tax-defaulted-property" target="_blank" rel="noreferrer">Riverside TTC <ExternalLink className="size-3" /></a>}
            <a className="inline-flex items-center gap-1 text-primary" href="https://www.bid4assets.com/" target="_blank" rel="noreferrer">Bid4Assets <ExternalLink className="size-3" /></a>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {tax.length === 0 ? <EmptyState title="No tax snapshots">They come in with the county tax-default and delinquent imports.</EmptyState> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1 font-medium">As of</th><th className="font-medium">Source</th><th className="text-right font-medium">Owed</th><th className="text-right font-medium">Owed/land</th><th className="text-right font-medium">Yrs default</th><th className="font-medium">Power to sell</th><th className="font-medium">Auction</th></tr>
              </thead>
              <tbody>
                {tax.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-1.5">{fmtDate(t.snapshot_date)}</td>
                    <td className="text-xs text-muted-foreground">{t.source}</td>
                    <td className="text-right tabular-nums">{fmtMoney(t.redemption_amount)}</td>
                    <td className="text-right tabular-nums">{t.owed_to_land_ratio === null ? "—" : `${(t.owed_to_land_ratio * 100).toFixed(0)}%`}</td>
                    <td className="text-right tabular-nums">{fmtNumber(t.years_in_default, 1)}</td>
                    <td>{fmtDate(t.power_to_sell_date)}</td>
                    <td>{t.auction_status === "none" ? "—" : `${t.auction_status}${t.auction_date ? ` · ${fmtDate(t.auction_date)}` : ""}`}{t.auction_url && <a className="ml-1 text-primary" href={t.auction_url} target="_blank" rel="noreferrer">link</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {latest && (latest.advalorem !== null || latest.specials !== null) && (
        <p className="text-xs text-muted-foreground">Latest breakdown: ad valorem {fmtMoney(latest.advalorem)} · specials {fmtMoney(latest.specials)}. Chart and offer calculator arrive in Phase 5.</p>
      )}
    </div>
  );
}
