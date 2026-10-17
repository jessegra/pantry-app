import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../app/App';
import { resetNagSession } from '../../app/nag';
import { repo } from '../../data/repo';

beforeEach(async () => {
  localStorage.clear();
  resetNagSession();
  await Promise.all(repo.db.tables.map((t) => t.clear()));
  await repo.loadSampleData();
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const row = (text: string) =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .find((li) => li.textContent!.includes(text))!;

const byName = async (name: string) => (await repo.db.recipes.toArray()).find((r) => r.name === name)!;

describe('adding a recipe', () => {
  it('saves, asking only about what it could not match', async () => {
    const user = userEvent.setup();
    renderAt('/recipes');
    await user.click(await screen.findByRole('link', { name: 'New recipe' }));
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Pancakes');
    await user.click(screen.getByRole('button', { name: 'breakfast' }));
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'Sunday{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'Serves (optional)' }), '4');
    await user.type(
      screen.getByRole('textbox', { name: 'Ingredients, one per line' }),
      '2 cups flour{Enter}2 eggs{Enter}1 cup coconut milk{Enter}2 tsp baking powder{Enter}pinch of salt',
    );
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Check ingredients' })).toBeInTheDocument();
    expect(screen.getByText(/2 ingredients need a look/)).toBeInTheDocument();
    // Clear matches are one line each, with a way to change them.
    expect(row('2 cups flour')).toHaveTextContent('Flour');
    expect(screen.getByRole('button', { name: 'Change match for pinch of salt' })).toBeInTheDocument();
    // The uncertain one is offered, not assumed.
    expect(within(row('coconut milk')).getByText('Not sure. Is this your Milk?')).toBeInTheDocument();
    expect(within(row('coconut milk')).getByRole('combobox', { name: /Matches/ })).toHaveValue('none');
    // Owner's call: baking powder is a staple here.
    await user.selectOptions(within(row('baking powder')).getByRole('combobox', { name: /Matches/ }), 'staple');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Pancakes' })).toBeInTheDocument();
    expect(screen.getByText('breakfast · sunday · Serves 4')).toBeInTheDocument();
    expect(screen.getByText('Missing 1 ingredient')).toBeInTheDocument();
    const saved = await byName('Pancakes');
    expect(saved.ingredients.map((i) => [i.name, i.match, i.itemId])).toEqual([
      ['flour', 'item', 'it-flour'],
      ['eggs', 'item', 'it-eggs'],
      ['coconut milk', 'none', undefined],
      ['baking powder', 'staple', undefined],
      ['salt', 'staple', undefined],
    ]);
  });

  it('links a suggestion and adds a substitute', async () => {
    const user = userEvent.setup();
    renderAt('/recipes/new');
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Cereal');
    await user.type(screen.getByRole('textbox', { name: 'Ingredients, one per line' }), '1 cup coconut milk');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    await user.click(await screen.findByRole('button', { name: 'Link to Milk' }));
    await user.selectOptions(within(row('coconut milk')).getByRole('combobox', { name: /Also does/ }), 'Butter');
    expect(within(row('coconut milk')).getByRole('button', { name: 'Remove substitute Butter' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    await screen.findByRole('heading', { level: 1, name: 'Cereal' });
    expect((await byName('Cereal')).ingredients[0]).toMatchObject({
      match: 'item',
      itemId: 'it-milk',
      substituteIds: ['it-butter'],
    });
  });

  it('needs a name not already used', async () => {
    const user = userEvent.setup();
    renderAt('/recipes/new');
    await user.click(await screen.findByRole('button', { name: 'Save recipe' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the recipe a name.');
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Waffles');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There’s already a recipe called Waffles.');
  });
});

describe('editing a recipe', () => {
  it('keeps earlier answers for unchanged lines and saves straight away', async () => {
    const user = userEvent.setup();
    renderAt('/recipe/rc-tacos');
    await user.click(await screen.findByRole('link', { name: 'Edit' }));
    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Chicken tacos');
    await user.clear(name);
    await user.type(name, 'Bean tacos');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bean tacos' })).toBeInTheDocument();
    const saved = (await repo.db.recipes.get('rc-tacos'))!;
    expect(saved.ingredients).toHaveLength(7);
    expect(saved.ingredients.find((i) => i.name === 'small tortillas')).toMatchObject({ match: 'none' });
  });

  it('can check and change any match', async () => {
    const user = userEvent.setup();
    renderAt('/recipe/rc-waffles/edit');
    await user.click(await screen.findByRole('button', { name: 'Check ingredient matches' }));
    expect(screen.getByText('Here’s how each ingredient matched your pantry.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Change match for .*baking powder/ }));
    await user.selectOptions(within(row('baking powder')).getByRole('combobox', { name: /Matches/ }), 'staple');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(await screen.findByText('Ready to make')).toBeInTheDocument();
  });

  it('deletes after asking', async () => {
    const user = userEvent.setup();
    renderAt('/recipe/rc-pizza/edit');
    await user.click(await screen.findByRole('button', { name: 'Delete recipe' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument();
    await waitFor(async () => expect(await repo.db.recipes.get('rc-pizza')).toBeUndefined());
    expect(screen.queryByRole('link', { name: /Pizza/ })).toBeNull();
  });
});

describe('Settings → Staples', () => {
  it('adds and deletes staples, and recipes follow', async () => {
    const user = userEvent.setup();
    renderAt('/settings/staples');
    await user.click(await screen.findByRole('button', { name: 'Add staple' }));
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Name' }), 'Baking powder');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Rename baking powder' })).toBeInTheDocument();
    // Waffles' only missing ingredient was baking powder.
    const { checkRecipe, pantryContext } = await import('../../domain/recipeMatch');
    const [items, staples, waffles] = await Promise.all([
      repo.db.items.toArray(),
      repo.db.staples.toArray(),
      repo.db.recipes.get('rc-waffles'),
    ]);
    expect(checkRecipe(waffles!, pantryContext(items, staples)).readiness).toBe('ready');

    await user.click(screen.getByRole('button', { name: 'Delete baking powder' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rename baking powder' })).toBeNull());
  });
});
