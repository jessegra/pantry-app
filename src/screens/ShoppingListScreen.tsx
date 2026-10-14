import { Link } from 'react-router-dom';
import { Placeholder, ScreenBody, ScreenHeader, ScreenTitle } from '../ui/Screen';

export function ShoppingListScreen() {
  return (
    <>
      <ScreenHeader>
        <ScreenTitle>Shopping list</ScreenTitle>
      </ScreenHeader>
      <ScreenBody>
        <Placeholder milestone="Milestone 6">
          The list grouped by store. <Link to="/shopped">I just shopped</Link>
        </Placeholder>
      </ScreenBody>
    </>
  );
}
