import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Inline, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const SEVERITY_APPEARANCE = { blocker: 'removed', major: 'moved', minor: 'default' };

const App = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  // Run the checker through the resolver; used on open and by the Re-check button.
  const load = () => {
    setLoading(true);
    invoke('getReport')
      .then(setReport)
      .catch((e) => setReport({ error: String(e) }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading && !report) return <Spinner label="Checking readiness" />;
  if (report && report.error) {
    return (
      <SectionMessage appearance="error" title="ReadyGate could not check this issue">
        <Text>{report.error}</Text>
        <Button onClick={load}>Try again</Button>
      </SectionMessage>
    );
  }

  const ready = report.status === 'READY';
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Heading size="medium">Readiness {report.score}/100</Heading>
        <Lozenge appearance={ready ? 'success' : 'removed'} isBold>{ready ? 'READY' : 'NEEDS INFO'}</Lozenge>
      </Inline>
      {report.missing.length === 0 ? (
        <Text>Every Definition of Ready rule for a {report.issueType} passes.</Text>
      ) : (
        <Stack space="space.075">
          {report.missing.map((m) => (
            <Stack key={m.id} space="space.025">
              <Inline space="space.100" alignBlock="center">
                <Lozenge appearance={SEVERITY_APPEARANCE[m.severity] || 'default'}>{m.severity}</Lozenge>
                <Text weight="bold">{m.label}</Text>
              </Inline>
              <Text>{m.hint}</Text>
            </Stack>
          ))}
        </Stack>
      )}
      <Inline space="space.100" alignBlock="center">
        <Button onClick={load} isDisabled={loading}>{loading ? 'Checking...' : 'Re-check'}</Button>
        {!ready && <Text>Open Rovo Chat and ask ReadyGate to draft the missing parts.</Text>}
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
