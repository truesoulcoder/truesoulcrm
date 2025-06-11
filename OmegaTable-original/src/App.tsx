import React from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Pagination,
  Spinner,
  getKeyValue,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  useDisclosure,
  Checkbox,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import useSWR from "swr";

const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function App() {
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedPerson, setSelectedPerson] = React.useState(null);
  const [selectedKeys, setSelectedKeys] = React.useState(new Set([]));
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [newLead, setNewLead] = React.useState({
    name: "",
    height: "",
    mass: "",
    birth_year: "",
    gender: "",
    eye_color: "",
  });
  const [sortDescriptor, setSortDescriptor] = React.useState({
    column: "name",
    direction: "ascending",
  });
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  // Update the API call to include rowsPerPage
  const {data, isLoading} = useSWR(`https://swapi.py4e.com/api/people?page=${page}&limit=${rowsPerPage}`, fetcher, {
    keepPreviousData: true,
  });

  // Filter data based on search term
  const filteredData = React.useMemo(() => {
    if (!data?.results) return [];
    
    // Apply pagination to filtered data
    const startIndex = 0;
    const endIndex = rowsPerPage;
    
    const filtered = data.results.filter(item => 
      Object.values(item).some(
        value => String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    
    return filtered.slice(startIndex, endIndex);
  }, [data?.results, searchTerm, rowsPerPage]);

  // Recalculate pages based on filtered data and rowsPerPage
  const pages = React.useMemo(() => {
    if (searchTerm) {
      return Math.ceil(filteredData.length / rowsPerPage) || 1;
    }
    return data?.count ? Math.ceil(data.count / rowsPerPage) : 0;
  }, [data?.count, filteredData.length, rowsPerPage, searchTerm]);

  // Reset to page 1 when rowsPerPage or searchTerm changes
  React.useEffect(() => {
    setPage(1);
  }, [rowsPerPage, searchTerm]);

  // Add sorting logic for the filtered data
  const sortedData = React.useMemo(() => {
    const dataToSort = [...(searchTerm ? filteredData : (data?.results || []))];
    
    return dataToSort.sort((a, b) => {
      const first = a[sortDescriptor.column];
      const second = b[sortDescriptor.column];
      
      // Handle numeric columns
      if (sortDescriptor.column === "height" || sortDescriptor.column === "mass") {
        const firstNum = Number(first.replace(/,/g, ""));
        const secondNum = Number(second.replace(/,/g, ""));
        
        // Handle "unknown" values
        if (isNaN(firstNum)) return sortDescriptor.direction === "ascending" ? 1 : -1;
        if (isNaN(secondNum)) return sortDescriptor.direction === "ascending" ? -1 : 1;
        
        return sortDescriptor.direction === "ascending" 
          ? firstNum - secondNum 
          : secondNum - firstNum;
      }
      
      // Handle string columns
      const cmp = first.localeCompare(second);
      return sortDescriptor.direction === "ascending" ? cmp : -cmp;
    });
  }, [sortDescriptor, searchTerm ? filteredData : data?.results]);

  const handleRowClick = (person) => {
    setSelectedPerson(person);
    onOpen();
  };

  const handleAddLead = () => {
    setIsAddModalOpen(true);
  };

  const handleSaveNewLead = () => {
    // In a real app, you would save this to your API
    // For this demo, we'll just close the modal
    setIsAddModalOpen(false);
    
    // Reset the form
    setNewLead({
      name: "",
      height: "",
      mass: "",
      birth_year: "",
      gender: "",
      eye_color: "",
    });
  };

  const handleNewLeadChange = (field, value) => {
    setNewLead(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const loadingState = isLoading || filteredData.length === 0 ? "loading" : "idle";

  // CSS for animated row selection
  const tableRowStyles = {
    selected: "relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-primary-100 before:to-primary-200 before:animate-gradient-x before:opacity-0 group-data-[selected=true]:before:opacity-100 before:transition-opacity before:duration-500",
    default: "cursor-pointer transition-all duration-300"
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row gap-4 justify-between items-center px-5">
        <Input
          className="w-[80%]"
          placeholder="Search..."
          value={searchTerm}
          onValueChange={setSearchTerm}
          startContent={<Icon icon="lucide:search" className="text-default-400" />}
          isClearable
        />
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-[10%]"
        >
          <Button 
            color="primary" 
            onPress={handleAddLead}
            className="w-full"
            startContent={<Icon icon="lucide:plus" />}
          >
            Add Lead
          </Button>
        </motion.div>
      </div>

      <Table
        aria-label="Example table with client async pagination"
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
        onRowAction={(key) => {
          const person = data?.results.find(item => item.name === key);
          handleRowClick(person);
        }}
        classNames={{
          tr: `${tableRowStyles.default} ${tableRowStyles.selected}`,
          td: "transition-colors duration-300",
          base: "min-h-[400px]",
          wrapper: "min-h-[400px]",
        }}
        bottomContent={
          <div className="flex w-full justify-between items-center px-2">
            <div className="flex items-center gap-2">
              <span className="text-small text-default-400">Rows per page:</span>
              <Select
                size="sm"
                className="w-[70px] min-w-max"
                selectedKeys={[`${rowsPerPage}`]}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                aria-label="Rows per page"
              >
                <SelectItem key="5" value="5">5</SelectItem>
                <SelectItem key="10" value="10">10</SelectItem>
                <SelectItem key="15" value="15">15</SelectItem>
                <SelectItem key="20" value="20">20</SelectItem>
              </Select>
            </div>
            <Pagination
              isCompact
              showControls
              showShadow
              color="primary"
              page={page}
              total={pages}
              onChange={(page) => setPage(page)}
            />
          </div>
        }
      >
        <TableHeader>
          <TableColumn key="name" allowsSorting>Name</TableColumn>
          <TableColumn key="height" allowsSorting>Height</TableColumn>
          <TableColumn key="mass" allowsSorting>Mass</TableColumn>
          <TableColumn key="birth_year" allowsSorting>Birth year</TableColumn>
        </TableHeader>
        <TableBody
          items={sortedData}
          loadingContent={<Spinner />}
          loadingState={loadingState}
          emptyContent={"No results found"}
        >
          {(item) => (
            <TableRow key={item?.name}>
              {(columnKey) => <TableCell>{getKeyValue(item, columnKey)}</TableCell>}
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Existing Modal for viewing lead details */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Lead Details
                <p className="text-small text-default-500">View and edit lead information</p>
              </ModalHeader>
              <ModalBody>
                {selectedPerson && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Name"
                      labelPlacement="outside"
                      placeholder="Name"
                      value={selectedPerson.name}
                      startContent={<Icon icon="lucide:user" className="text-default-400" />}
                      description="Lead's full name"
                    />
                    <Input
                      label="Height"
                      labelPlacement="outside"
                      placeholder="Height"
                      value={selectedPerson.height}
                      startContent={<Icon icon="lucide:ruler" className="text-default-400" />}
                      description="Lead's height value"
                    />
                    <Input
                      label="Mass"
                      labelPlacement="outside"
                      placeholder="Mass"
                      value={selectedPerson.mass}
                      startContent={<Icon icon="lucide:weight" className="text-default-400" />}
                      description="Lead's mass value"
                    />
                    <Input
                      label="Birth Year"
                      labelPlacement="outside"
                      placeholder="Birth Year"
                      value={selectedPerson.birth_year}
                      startContent={<Icon icon="lucide:calendar" className="text-default-400" />}
                      description="Lead's birth year"
                    />
                    <Input
                      label="Gender"
                      labelPlacement="outside"
                      placeholder="Gender"
                      value={selectedPerson.gender}
                      startContent={<Icon icon="lucide:user" className="text-default-400" />}
                      description="Lead's gender"
                    />
                    <Input
                      label="Eye Color"
                      labelPlacement="outside"
                      placeholder="Eye Color"
                      value={selectedPerson.eye_color}
                      startContent={<Icon icon="lucide:eye" className="text-default-400" />}
                      description="Lead's eye color"
                    />
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Close
                </Button>
                <Button color="primary" onPress={onClose}>
                  Save Changes
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* New Modal for adding a lead */}
      <Modal isOpen={isAddModalOpen} onOpenChange={setIsAddModalOpen} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Add New Lead
                <p className="text-small text-default-500">Enter information for the new lead</p>
              </ModalHeader>
              <ModalBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Name"
                    labelPlacement="outside"
                    placeholder="Enter name"
                    value={newLead.name}
                    onValueChange={(value) => handleNewLeadChange("name", value)}
                    startContent={<Icon icon="lucide:user" className="text-default-400" />}
                    description="Lead's full name"
                  />
                  <Input
                    label="Height"
                    labelPlacement="outside"
                    placeholder="Enter height"
                    value={newLead.height}
                    onValueChange={(value) => handleNewLeadChange("height", value)}
                    startContent={<Icon icon="lucide:ruler" className="text-default-400" />}
                    description="Lead's height value"
                  />
                  <Input
                    label="Mass"
                    labelPlacement="outside"
                    placeholder="Enter mass"
                    value={newLead.mass}
                    onValueChange={(value) => handleNewLeadChange("mass", value)}
                    startContent={<Icon icon="lucide:weight" className="text-default-400" />}
                    description="Lead's mass value"
                  />
                  <Input
                    label="Birth Year"
                    labelPlacement="outside"
                    placeholder="Enter birth year"
                    value={newLead.birth_year}
                    onValueChange={(value) => handleNewLeadChange("birth_year", value)}
                    startContent={<Icon icon="lucide:calendar" className="text-default-400" />}
                    description="Lead's birth year"
                  />
                  <Input
                    label="Gender"
                    labelPlacement="outside"
                    placeholder="Enter gender"
                    value={newLead.gender}
                    onValueChange={(value) => handleNewLeadChange("gender", value)}
                    startContent={<Icon icon="lucide:user" className="text-default-400" />}
                    description="Lead's gender"
                  />
                  <Input
                    label="Eye Color"
                    labelPlacement="outside"
                    placeholder="Enter eye color"
                    value={newLead.eye_color}
                    onValueChange={(value) => handleNewLeadChange("eye_color", value)}
                    startContent={<Icon icon="lucide:eye" className="text-default-400" />}
                    description="Lead's eye color"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSaveNewLead}>
                  Save Lead
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}