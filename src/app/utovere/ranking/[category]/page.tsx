import { redirect } from "next/navigation";

// Legacy route – the ranking lives on /utovere/topp100
export default async function RankingRedirect({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  redirect(`/utovere/topp100?category=${encodeURIComponent(category)}`);
}
