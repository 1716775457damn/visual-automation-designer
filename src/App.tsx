/**
 * App — 应用入口组件（Phase 4d 精简后）
 * 职责：组合 AppProviders + AppShell，无业务逻辑。
 */

import { AppProviders } from './AppProviders';
import { AppShell } from './AppShell';

function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}

export default App;
