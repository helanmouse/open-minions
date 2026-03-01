import csv, json, sys

def export_csv(input_file, output_file):
    with open(input_file) as f:
        data = json.load(f)
    with open(output_file, 'w', newline='') as f:  # BUG: missing encoding='utf-8'
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

if __name__ == '__main__':
    export_csv(sys.argv[1], sys.argv[2])
