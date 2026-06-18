import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fill in the Blank – LexiVault",
  description: "Test your vocabulary by typing the correct word from its English meaning clue.",
};

export default function FillBlankLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
