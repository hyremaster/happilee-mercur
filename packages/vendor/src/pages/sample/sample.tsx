import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { DashboardLayout } from "@components/layout/dashboard-layout";

export const SamplePage = () => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const name = formData.get("name") as string;

    console.log(name);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-1 flex-col overflow-y-auto p-8">
        <h1 className="text-2xl font-bold">Welcome to Untitled UI + Vite</h1>
        <form onSubmit={handleSubmit} className="mt-4">
          <Input label="Name" name="name" placeholder="Enter your name" />
          <Button type="submit" className="mt-2">
            Submit
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
};
