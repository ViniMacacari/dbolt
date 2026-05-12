import { SqlSyntaxValidationService } from './sql-syntax-validation.service'

describe('SqlSyntaxValidationService', () => {
  let service: SqlSyntaxValidationService

  beforeEach(() => {
    service = new SqlSyntaxValidationService()
  })

  it('does not report T-SQL parser errors for HANA SQLScript procedures', async () => {
    const sql = `
      CREATE PROCEDURE "_SP_NF22"(DtBase nvarchar(4000), DocEntry int, GerarNF int, ObjectType NVARCHAR(20))
      LANGUAGE SQLSCRIPT AS
      BEGIN
        Entidade int;
        Sql_BP nvarchar(4000);
      END;
    `

    await expectAsync(service.validate(sql, { sgbd: 'Hana' })).toBeResolvedTo([])
  })
})
