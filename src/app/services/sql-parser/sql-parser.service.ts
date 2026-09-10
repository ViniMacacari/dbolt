import { Injectable } from '@angular/core'

export type SqlParserDatabase = 'mysql' | 'postgresql' | 'sqlite' | 'transactsql'

export interface DboltSqlParser {
  astify: (sql: string, options?: any) => unknown
  sqlify: (ast: any, options?: any) => string
  exprToSQL: (expression: any, options?: any) => string
}

interface SqlParserModule {
  Parser?: new () => DboltSqlParser
  default?: {
    Parser?: new () => DboltSqlParser
  }
}

@Injectable({
  providedIn: 'root'
})
export class SqlParserService {
  private readonly parsers = new Map<SqlParserDatabase, Promise<DboltSqlParser>>()

  async astify(sql: string, context?: any, hanaAnsiMode = false): Promise<unknown> {
    const database = this.resolveDatabase(context, hanaAnsiMode)
    const parser = await this.getParser(database)

    return parser.astify(sql, {
      database,
      parseOptions: {
        includeLocations: true
      }
    })
  }

  async sqlify(ast: unknown, context?: any, hanaAnsiMode = false): Promise<string> {
    const database = this.resolveDatabase(context, hanaAnsiMode)
    const parser = await this.getParser(database)
    return parser.sqlify(ast, { database })
  }

  async expressionToSql(expression: unknown, context?: any, hanaAnsiMode = false): Promise<string> {
    const database = this.resolveDatabase(context, hanaAnsiMode)
    const parser = await this.getParser(database)
    return parser.exprToSQL(expression, { database })
  }

  resolveDatabase(context?: any, hanaAnsiMode = false): SqlParserDatabase {
    const database = String(context?.sgbd || context?.database || '').toLowerCase()

    if (database === 'postgres' || (database === 'hana' && hanaAnsiMode)) return 'postgresql'
    if (database === 'sqlite') return 'sqlite'
    if (database === 'mysql') return 'mysql'

    return 'transactsql'
  }

  private getParser(database: SqlParserDatabase): Promise<DboltSqlParser> {
    const cachedParser = this.parsers.get(database)
    if (cachedParser) return cachedParser

    const parserPromise = this.loadParser(database)
    this.parsers.set(database, parserPromise)
    return parserPromise
  }

  private async loadParser(database: SqlParserDatabase): Promise<DboltSqlParser> {
    const parserModule = await this.importParserModule(database)
    const ParserConstructor = parserModule.Parser || parserModule.default?.Parser

    if (!ParserConstructor) {
      throw new Error('Could not load SQL parser.')
    }

    return new ParserConstructor()
  }

  private async importParserModule(database: SqlParserDatabase): Promise<SqlParserModule> {
    if (database === 'mysql') {
      return import('node-sql-parser/build/mysql')
    }

    if (database === 'postgresql') {
      return import('node-sql-parser/build/postgresql')
    }

    if (database === 'sqlite') {
      return import('node-sql-parser/build/sqlite')
    }

    return import('node-sql-parser/build/transactsql')
  }
}
