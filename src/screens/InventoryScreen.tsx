import { Placeholder, ScreenBody, ScreenHeader, ScreenTitle } from '../ui/Screen';

export function InventoryScreen() {
  return (
    <>
      <ScreenHeader>
        <ScreenTitle>Inventory</ScreenTitle>
      </ScreenHeader>
      <ScreenBody>
        <Placeholder milestone="Milestone 3">Items under their locations, with status bars.</Placeholder>
      </ScreenBody>
    </>
  );
}
