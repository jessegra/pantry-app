import { Placeholder, ScreenBody, ScreenHeader, ScreenTitle } from '../ui/Screen';

export function QuickAddScreen() {
  return (
    <>
      <ScreenHeader>
        <ScreenTitle>Quick add</ScreenTitle>
      </ScreenHeader>
      <ScreenBody>
        <Placeholder milestone="Milestone 5">Search, +1, and recent items.</Placeholder>
      </ScreenBody>
    </>
  );
}
