import { Container, Heading, Text, Badge } from "@medusajs/ui"

export default function TestPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Container>
        <div className="flex items-center justify-between mb-4">
          <Heading level="h1">Test Page</Heading>
          <Badge color="green">Working</Badge>
        </div>
        <Text className="text-ui-fg-subtle">
          This is a dummy vendor page added for local development testing.
          If you can see this, file-based routing is working correctly.
        </Text>
      </Container>

      <Container>
        <Heading level="h2" className="mb-3">Setup Checklist</Heading>
        <ul className="flex flex-col gap-2">
          {[
            "Postgres running",
            "Redis running",
            "bun install complete",
            "bun run build complete",
            "DB migrations applied",
            "Vendor app dev server started",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Badge color="green">✓</Badge>
              <Text>{item}</Text>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  )
}
