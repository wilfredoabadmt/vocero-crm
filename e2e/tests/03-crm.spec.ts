import { expect, test } from '@playwright/test';

test.describe.serial('CRM: etiquetas, notas y kanban', () => {
  test('etiquetar un lead y registrar una nota interna (US3)', async ({ page }) => {
    await page.goto('/');
    await page.getByText('María López', { exact: true }).click();

    // Crear y asignar etiqueta desde el panel del lead
    await page.getByTestId('add-tag').click();
    await page.getByTestId('new-tag-input').fill('interesado');
    await page.getByTestId('new-tag-input').press('Enter');
    await expect(page.getByTestId('contact-tags').getByText('interesado')).toBeVisible();
    await page.keyboard.press('Escape'); // cierra el dropdown modal de etiquetas

    // Nota interna con autor
    await page.getByTestId('note-input').fill('Pidió disponibilidad; cotizar tour premium.');
    await page.getByTestId('note-save').click();
    await expect(page.getByTestId('notes-list').getByText('Pidió disponibilidad; cotizar tour premium.')).toBeVisible();
    await expect(page.getByTestId('notes-list').getByText(/Administrador/)).toBeVisible();
  });

  test('filtrar conversaciones por etiqueta (FR-007)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Filtros' }).click();
    await page.getByRole('menuitem', { name: /interesado/ }).click();
    await expect(page.getByText('María López', { exact: true })).toBeVisible();
    await expect(page.getByText('Lead Frio', { exact: true })).toHaveCount(0);
  });

  test('mover un lead de etapa en el kanban con drag & drop (US4)', async ({ page }) => {
    await page.goto('/kanban');

    const col1 = page.getByTestId('kanban-column-1');
    const col2 = page.getByTestId('kanban-column-2');
    await expect(col1.getByText('María López', { exact: true })).toBeVisible();

    const card = col1.getByText('María López', { exact: true });
    const target = col2.locator('div.border-dashed');

    // Drag manual compatible con dnd-kit (PointerSensor, distancia 6px)
    const cardBox = (await card.boundingBox())!;
    const targetBox = (await target.boundingBox())!;
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 15, cardBox.y + 15, { steps: 3 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 60, { steps: 12 });
    await page.mouse.up();

    await expect(col2.getByText('María López')).toBeVisible();

    // Persiste tras recargar
    await page.reload();
    await expect(page.getByTestId('kanban-column-2').getByText('María López')).toBeVisible();
  });

  test('renombrar una etapa del embudo (FR-019)', async ({ page }) => {
    await page.goto('/ajustes/crm');
    await page.getByRole('button', { name: 'Renombrar En conversación' }).click();
    await page.getByTestId('stage-input-2').fill('Negociación');
    await page.getByTestId('stage-input-2').press('Enter');
    await expect(page.getByText('Etapa renombrada')).toBeVisible();

    await page.goto('/kanban');
    await expect(page.getByRole('heading', { name: 'Negociación' })).toBeVisible();
  });
});
