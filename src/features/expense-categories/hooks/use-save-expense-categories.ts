import {
  EXPENSE_CATEGORIES_ENDPOINTS,
  EXPENSE_CATEGORIES_PATH,
  expenseCategoriesPath,
} from '@/features/expense-categories/api/expense-categories.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  expenseCategoriesSchema,
  type ExpenseCategories,
  type ExpenseCategoriesFormValues,
} from '@/features/expense-categories/schemas/expense-categories.schema';

/** The two writes of the form, one for each screen. */
export interface ExpenseCategoriesSave {
  readonly create: CommonMutation<ExpenseCategoriesFormValues, ExpenseCategories>;
  readonly update: CommonMutation<ExpenseCategoriesFormValues, ExpenseCategories>;
}

/**
 * The writes (FE-03): `EXPENSE_CATEGORIES_ENDPOINTS.create` and `.update`, the method and the path
 * come from the table the api module is held to, NEVER
 * retried automatically (ADR-0031 §5); a 400 carries `issues` for the form. They invalidate
 * nothing: the screen swaps the saved row into the cached list pages after an edit and revalidates
 * them after a create, so no list page is asked again for an edit (D-36). With no id (the create
 * screen) `update` is never triggered.
 */
export function useSaveExpenseCategories(id: string | null): ExpenseCategoriesSave {
  const create = useCommonMutation<ExpenseCategoriesFormValues, ExpenseCategories>(
    EXPENSE_CATEGORIES_PATH,
    {
      method: EXPENSE_CATEGORIES_ENDPOINTS.create.method,
      schema: expenseCategoriesSchema,
      invalidate: [],
    },
  );
  const update = useCommonMutation<ExpenseCategoriesFormValues, ExpenseCategories>(
    id === null ? EXPENSE_CATEGORIES_PATH : expenseCategoriesPath(id),
    {
      method: EXPENSE_CATEGORIES_ENDPOINTS.update.method,
      schema: expenseCategoriesSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
