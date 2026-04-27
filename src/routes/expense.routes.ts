import { Router } from 'express';
import * as expenseController from '../controllers/expense.controller';

const router = Router();

router.post('/',      expenseController.createExpense);
router.get('/',       expenseController.listExpenses);
router.patch('/:id',  expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

export default router;
