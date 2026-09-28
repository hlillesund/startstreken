import Image from "next/image";

export default function EventPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <div>
      <h1>{params.slug}</h1>
    </div>
  );
}