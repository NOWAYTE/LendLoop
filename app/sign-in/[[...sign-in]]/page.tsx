import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <SignIn fallbackRedirectUrl="/tools" />
    </main>
  );
}
