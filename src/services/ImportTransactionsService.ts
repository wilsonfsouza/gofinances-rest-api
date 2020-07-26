import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);
    const csvReadStream = fs.createReadStream(filePath);
    const parser = csvParse({
      from_line: 2,
    });

    const parseCSV = csvReadStream.pipe(parser);

    const transactionsFromCSVList: CSVTransaction[] = [];
    const categoriesFromCSVList: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categoriesFromCSVList.push(category);
      transactionsFromCSVList.push({ title, type, value, category });
    });
    await new Promise(resolve => parseCSV.on('end', resolve));

    const currentCategories = await categoriesRepository.find({
      where: {
        title: In(categoriesFromCSVList),
      },
    });

    const currentCategoriesTitle = currentCategories.map(
      (category: Category) => category.title,
    );

    const newCategories = categoriesFromCSVList
      .filter(category => !currentCategoriesTitle.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategoriesToBeAdded = categoriesRepository.create(
      newCategories.map(title => ({
        title,
      })),
    );
    await categoriesRepository.save(newCategoriesToBeAdded);

    const allFinalCategories = [
      ...newCategoriesToBeAdded,
      ...currentCategories,
    ];

    const newTransactionsToBeAdded = transactionsRepository.create(
      transactionsFromCSVList.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allFinalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(newTransactionsToBeAdded);

    await fs.promises.unlink(filePath);

    return newTransactionsToBeAdded;
  }
}

export default ImportTransactionsService;
