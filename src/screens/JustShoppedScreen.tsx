import { Link } from 'react-router-dom';
import { Placeholder, ScreenBody, ScreenHeader, ScreenTitle } from '../ui/Screen';

export function JustShoppedScreen() {
  return (
    <>
      <ScreenHeader>
        <Link to="/list">Close</Link>
        <ScreenTitle>Just shopped</ScreenTitle>
      </ScreenHeader>
      <ScreenBody>
        <Placeholder milestone="Milestone 7">Log the trip one item at a time.</Placeholder>
      </ScreenBody>
    </>
  );
}
