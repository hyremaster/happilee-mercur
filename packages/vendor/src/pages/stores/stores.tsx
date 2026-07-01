import {
  ArrowLeft,
  Building02,
  DotsVertical,
  Edit01,
  Plus,
} from "@happilee-app/icons";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  Cell,
  Column,
  EmptyState,
  Pagination,
  Row,
  Table,
  TableBody,
  TableHeader,
  UtilityButton,
} from "@happilee-app/ui";
import { useNavigate } from "react-router-dom";
import { StoreSetupLayout } from "../onboard/_components/store-setup-layout";
import { STORES } from "./_components/constants";
import { SearchAndFilters } from "./_components/search-and-filters";
import { StoreAvatar } from "./_components/store-avatar";

export const StoresPage = () => {
  const navigate = useNavigate();
  const hasStores = STORES.length > 0;

  return (
    <StoreSetupLayout minHeight="h-screen" contentClassName="">
      <div className="flex flex-col">
        <div className="flex items-center gap-md px-3xl py-xl">
          <UtilityButton
            icon={<ArrowLeft />}
            aria-label="Go back"
            variant="tertiary"
            size="md"
            onPress={() => navigate("/onboard")}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-xxs">
            <span className="text-xl font-semibold leading-8 text-text-primary">
              Stores
            </span>
            <span className="text-sm text-text-tertiary">
              Manage all the stores in your workspace. Each store has its own
              catalog, orders, and settings.
            </span>
          </div>

          {hasStores ? (
            <Button
              hierarchy="primary"
              size="md"
              iconLeading={<Plus />}
              onPress={() => navigate("/onboard")}
            >
              Create new store
            </Button>
          ) : (
            <UtilityButton
              icon={<DotsVertical />}
              aria-label="More options"
              variant="tertiary"
              size="md"
            />
          )}
        </div>

        <div className="h-px w-full border-b border-border-secondary" />
      </div>

      <div className="flex flex-col gap-xl px-3xl py-2xl">
        <div className="flex justify-end">
          <SearchAndFilters />
        </div>

        {!hasStores ? (
          <Card className="w-full">
            <CardBody className="flex items-center justify-center py-4xl">
              <EmptyState
                icon={<Building02 />}
                iconColor="gray"
                iconSize="md"
                title="No stores found"
                description="There is no existing store here, Start building your new store."
                action={
                  <Button
                    hierarchy="primary"
                    size="md"
                    iconLeading={<Plus />}
                    onPress={() => navigate("/onboard")}
                  >
                    Create new store
                  </Button>
                }
              />
            </CardBody>
          </Card>
        ) : (
          <Card className="w-full">
            <CardBody className="overflow-x-auto p-0">
              <Table aria-label="Stores" className="min-w-[700px]">
                <TableHeader>
                  <Column>Store name</Column>
                  <Column allowsSorting>Status</Column>
                  <Column>Industry</Column>
                  <Column helpText="How orders are fulfilled and shipped to customers">
                    Commerce type
                  </Column>
                  <Column className="w-px">{null}</Column>
                </TableHeader>
                <TableBody>
                  {STORES.map((store) => (
                    <Row key={store.id}>
                      <Cell primary>
                        <div className="flex items-center gap-md">
                          <StoreAvatar initials={store.initials} />
                          <div className="flex min-w-0 flex-col gap-xxs">
                            <span className="truncate text-sm font-medium leading-5 text-text-primary">
                              {store.name}
                            </span>
                            <span className="truncate text-xs leading-[18px] text-text-tertiary">
                              {store.handle}
                            </span>
                          </div>
                        </div>
                      </Cell>
                      <Cell>
                        <Badge color="success" size="sm" withDot>
                          {store.status}
                        </Badge>
                      </Cell>
                      <Cell>{store.industry}</Cell>
                      <Cell>{store.commerceType}</Cell>
                      <Cell className="text-right">
                        <div className="inline-flex items-center justify-end gap-xxs">
                          <UtilityButton
                            icon={<Edit01 />}
                            aria-label={`Edit ${store.name}`}
                            variant="tertiary"
                            size="xs"
                          />
                          <UtilityButton
                            icon={<DotsVertical />}
                            aria-label={`More options for ${store.name}`}
                            variant="tertiary"
                            size="xs"
                          />
                        </div>
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
            <CardFooter className="p-0">
              <Pagination
                currentPage={1}
                totalPages={5}
                onPageChange={() => undefined}
              />
            </CardFooter>
          </Card>
        )}
      </div>
    </StoreSetupLayout>
  );
};
