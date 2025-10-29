function ComponentProperty({
  componentSetInfo,
}: {
  componentSetInfo: ComponentPropertyDefinitions;
}) {
  return (
    <div>
      <h2>Component Property</h2>
      <pre>{JSON.stringify(componentSetInfo, null, 2)}</pre>
    </div>
  );
}

export default ComponentProperty;
