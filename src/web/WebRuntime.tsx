import BackgroundSync from "../sync/BackgroundSync";
import WebStatus from "../WebStatus";

/** Web/PWA-only lifecycle owner. This module is unreachable from Tauri builds. */
export default function WebRuntime() {
  return <><BackgroundSync /><WebStatus /></>;
}
