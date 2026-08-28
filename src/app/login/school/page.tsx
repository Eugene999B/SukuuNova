import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function SchoolLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
        <Link className="text-sm text-slate-500 hover:text-nova" href="/">
          ← SukuuNova
        </Link>
        <h1 className="mt-6 text-3xl font-bold">School user login</h1>
        <p className="mt-2 text-slate-600">
          Use the code issued to your school and your school account.
        </p>
        <LoginForm universe="school" />
      </section>
    </main>
  );
}
