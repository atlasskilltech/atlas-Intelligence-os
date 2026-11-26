import { getStorageInfo } from "@/lib/config/env";
import StorageNoticeView from "./StorageNoticeView";

/** Server wrapper: warns when data is only kept temporarily (Vercel serverless, no database yet). */
export default function StorageNotice(props) {
  return <StorageNoticeView temporary={getStorageInfo().temporary} {...props} />;
}
