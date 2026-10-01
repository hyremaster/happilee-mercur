import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"

import {
  EmailCell,
  EmailHeader,
} from "../../../components/table/table-cells/common/email-cell"
import {
  NameCell,
  NameHeader,
} from "../../../components/table/table-cells/common/name-cell"
import {
  AccountCell,
  AccountHeader,
} from "../../../components/table/table-cells/customer/account-cell/account-cell"
import {
  FirstSeenCell,
  FirstSeenHeader,
} from "../../../components/table/table-cells/customer/first-seen-cell"
import { HttpTypes } from "@medusajs/types"
import { useTranslation } from "react-i18next"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"

const columnHelper = createColumnHelper<HttpTypes.AdminCustomer>()

export const useCustomerTableColumns = () => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.display({
        id: "email",
        header: () => <EmailHeader />,
        cell: ({ row: { original } }) => {
          const contactEmail = original.metadata?.contact_email
          return (
            <EmailCell
              email={typeof contactEmail === "string" ? contactEmail : null}
            />
          )
        },
      }),
      columnHelper.accessor("phone", {
        header: () => (
          <div className="flex h-full w-full items-center">
            <span className="truncate">{t("fields.phone")}</span>
          </div>
        ),
        cell: ({ getValue }) => {
          const phone = getValue()
          return phone ? (
            <div className="flex h-full w-full items-center overflow-hidden">
              <span className="truncate">{phone}</span>
            </div>
          ) : (
            <PlaceholderCell />
          )
        },
      }),
      columnHelper.display({
        id: "name",
        header: () => <NameHeader />,
        cell: ({
          row: {
            original: { first_name, last_name },
          },
        }) => <NameCell firstName={first_name} lastName={last_name} />,
      }),
      columnHelper.accessor("has_account", {
        header: () => <AccountHeader />,
        cell: ({ getValue }) => <AccountCell hasAccount={getValue()} />,
      }),
      columnHelper.accessor("created_at", {
        header: () => <FirstSeenHeader />,
        cell: ({ getValue }) => <FirstSeenCell createdAt={getValue()} />,
      }),
    ],
    [t]
  )
}
