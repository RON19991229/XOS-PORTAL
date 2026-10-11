// v2.23.0 — wraps every /checkin page in `.ck-fx` so the shine / press /
// ripple styles in globals.css only apply to the customer flow.
import CheckinFxLayer from '@/components/CheckinFxLayer';

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ck-fx">
      {children}
      <CheckinFxLayer />
    </div>
  );
}
