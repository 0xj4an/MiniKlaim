import { redirect } from "next/navigation";

/** Direct link to the support form: miniklaim.fun/support. */
export default function SupportPage() {
  redirect("/about?support=1");
}
