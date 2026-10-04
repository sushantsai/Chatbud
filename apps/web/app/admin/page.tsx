"use client";
import Link from "next/link";
import {
  CalendarDays,
  LifeBuoy,
  Package,
  ShieldCheck,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { teamRoleLabels } from "../_lib/roles";
import { useLoad } from "./_components/use-load";
function Tile({
  href,
  icon: Icon,
  label,
  value,
  note,
  alert,
}: {
  href: string;
  icon: any;
  label: string;
  value: number;
  note: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className={`ops-tile${alert ? " alert" : ""}`}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </Link>
  );
}
export default function TeamDashboard() {
  const { data } = useLoad("ops_dashboard");
  if (!data)
    return (
      <div className="loading" role="status">
        Loading the dashboard…
      </div>
    );
  return (
    <>
      <p className="section-copy ops-roles">
        Signed in as:{" "}
        {data.roles
          .filter((r: string) => teamRoleLabels[r])
          .map((r: string) => teamRoleLabels[r])
          .join(", ")}
      </p>
      <div className="ops-grid">
        {data.applications !== null && (
          <Tile
            href="/admin/applications"
            icon={ShieldCheck}
            label="Applications to review"
            value={data.applications}
            note="Professionals waiting to be listed"
            alert={data.applications > 0}
          />
        )}
        {data.tickets && (
          <>
            <Tile
              href="/admin/support"
              icon={LifeBuoy}
              label="Open grievances"
              value={data.tickets.open}
              note={`${data.tickets.unassigned} not yet assigned`}
              alert={data.tickets.unassigned > 0}
            />
            <Tile
              href="/admin/support"
              icon={TriangleAlert}
              label="Escalated"
              value={data.tickets.escalated}
              note="Need a senior decision"
              alert={data.tickets.escalated > 0}
            />
          </>
        )}
        {data.bookings && (
          <>
            <Tile
              href="/admin/bookings"
              icon={CalendarDays}
              label="Awaiting confirmation"
              value={data.bookings.awaiting}
              note={`${data.bookings.lapsed} lapsed unanswered this week`}
              alert={data.bookings.lapsed > 0}
            />
            <Tile
              href="/admin/bookings"
              icon={CalendarDays}
              label="Upcoming appointments"
              value={data.bookings.upcoming}
              note="Confirmed and still to happen"
            />
          </>
        )}
        {data.catalogue && (
          <>
            <Tile
              href="/admin/catalogue"
              icon={Package}
              label="Products on sale"
              value={data.catalogue.published}
              note={`${data.catalogue.drafts} not yet published`}
            />
            <Tile
              href="/admin/catalogue"
              icon={Tag}
              label="Live offers"
              value={data.catalogue.offers}
              note={`${data.catalogue.promos} promo codes active`}
            />
          </>
        )}
      </div>
    </>
  );
}
