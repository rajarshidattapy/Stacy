import GeneratePage from "@/components/generate/Generate";

async function getData() {
  await new Promise((r) => setTimeout(r, 1500));
  return { ok: true };
}

export default async function Generate() {
    const data = await getData();
    return <GeneratePage />;
}
