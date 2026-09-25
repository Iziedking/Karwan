/// A sentence with an address in it. The address stays left to right in every
/// language, and each translation keeps its own word order around it.
export function AddressText({ template, address }: { template: string; address: string }) {
  const [before, after = ''] = template.split('{grouped}');
  return (
    <>
      {before}
      <span dir="ltr" className="mono tabular-nums">{address}</span>
      {after}
    </>
  );
}
